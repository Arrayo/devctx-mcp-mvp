import smtplib
from email.message import EmailMessage
from dataclasses import dataclass


@dataclass
class NotificationConfig:
    smtp_host: str
    smtp_port: int
    sender: str
    api_key: str | None = None


class EmailNotifier:
    def __init__(self, config: NotificationConfig):
        self.config = config

    def send_email(self, to: str, subject: str, body: str) -> bool:
        msg = EmailMessage()
        msg["From"] = self.config.sender
        msg["To"] = to
        msg["Subject"] = subject
        msg.set_content(body)

        try:
            with smtplib.SMTP(self.config.smtp_host, self.config.smtp_port) as server:
                server.send_message(msg)
            return True
        except smtplib.SMTPException:
            return False

    def send_welcome(self, user_email: str, user_name: str) -> bool:
        return self.send_email(
            to=user_email,
            subject="Welcome!",
            body=f"Hello {user_name}, welcome to our platform.",
        )

    def send_password_reset(self, user_email: str, reset_link: str) -> bool:
        return self.send_email(
            to=user_email,
            subject="Password Reset",
            body=f"Click here to reset your password: {reset_link}",
        )


def create_notifier(host: str, port: int, sender: str) -> EmailNotifier:
    config = NotificationConfig(smtp_host=host, smtp_port=port, sender=sender)
    return EmailNotifier(config)
