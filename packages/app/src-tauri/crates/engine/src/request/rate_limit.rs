use std::time::Duration;
use tokio::sync::Mutex;
use tokio::time::Instant;

/// 限速器:保证相邻两次 `acquire` 之间至少间隔 `min_interval`。
/// 跨请求共享(挂在 `HttpClient` 上),由调度层据规则的 `rateLimit` 配置。
/// 持锁跨越 sleep,以串行化获取顺序,达到稳定节流。
#[derive(Debug)]
pub struct RateLimiter {
    min_interval: Duration,
    last: Mutex<Option<Instant>>,
}

impl RateLimiter {
    pub fn new(min_interval: Duration) -> Self {
        Self {
            min_interval,
            last: Mutex::new(None),
        }
    }

    /// 由「每秒请求数」换算最小间隔。rate <= 0 视为不限速。
    pub fn per_second(rate: f64) -> Self {
        if rate <= 0.0 {
            return Self::disabled();
        }
        Self::new(Duration::from_secs_f64(1.0 / rate))
    }

    /// 不限速。
    pub fn disabled() -> Self {
        Self::new(Duration::ZERO)
    }

    /// 取得一个许可:必要时等待到距上次至少 `min_interval`。
    pub async fn acquire(&self) {
        if self.min_interval.is_zero() {
            return;
        }
        let mut last = self.last.lock().await;
        let now = Instant::now();
        let ready_at = match *last {
            Some(prev) => prev + self.min_interval,
            None => now,
        };
        if ready_at > now {
            tokio::time::sleep_until(ready_at).await;
        }
        *last = Some(Instant::now());
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::Instant as StdInstant;

    #[tokio::test]
    async fn spaces_consecutive_acquires() {
        let limiter = RateLimiter::new(Duration::from_millis(60));
        let start = StdInstant::now();
        limiter.acquire().await; // 首次立即
        limiter.acquire().await; // 第二次等待 ~60ms
        let elapsed = start.elapsed();
        assert!(
            elapsed >= Duration::from_millis(55),
            "两次获取间隔应不小于约 60ms,实际 {elapsed:?}"
        );
    }

    #[tokio::test]
    async fn disabled_does_not_wait() {
        let limiter = RateLimiter::disabled();
        let start = StdInstant::now();
        for _ in 0..5 {
            limiter.acquire().await;
        }
        assert!(start.elapsed() < Duration::from_millis(30));
    }

    #[test]
    fn per_second_maps_to_interval() {
        let limiter = RateLimiter::per_second(4.0);
        assert_eq!(limiter.min_interval, Duration::from_millis(250));
    }
}
