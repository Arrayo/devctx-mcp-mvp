use std::sync::Arc;

pub struct UserService;

impl UserService {
    pub async fn create(&self, email: &str) -> Result<(), String> {
        Ok(())
    }
}

pub fn build_service() -> Arc<UserService> {
    Arc::new(UserService)
}
