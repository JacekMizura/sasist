"""Pydantic schemas for mail module API."""

from __future__ import annotations

from typing import Optional

from pydantic import BaseModel, Field


class MailAccountCreate(BaseModel):
    tenant_id: int = Field(..., ge=1)
    name: str = Field(..., min_length=1, max_length=255)
    email_address: str = Field(..., min_length=3, max_length=320)
    imap_host: Optional[str] = None
    imap_port: Optional[int] = Field(None, ge=1, le=65535)
    imap_security: Optional[str] = "SSL"
    imap_username: Optional[str] = None
    imap_password: Optional[str] = None
    smtp_host: Optional[str] = None
    smtp_port: Optional[int] = Field(None, ge=1, le=65535)
    smtp_security: Optional[str] = "TLS"
    smtp_username: Optional[str] = None
    smtp_password: Optional[str] = None
    is_send_only: bool = False
    is_active: bool = True


class MailAccountUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=255)
    email_address: Optional[str] = Field(None, min_length=3, max_length=320)
    imap_host: Optional[str] = None
    imap_port: Optional[int] = Field(None, ge=1, le=65535)
    imap_security: Optional[str] = None
    imap_username: Optional[str] = None
    imap_password: Optional[str] = None
    smtp_host: Optional[str] = None
    smtp_port: Optional[int] = Field(None, ge=1, le=65535)
    smtp_security: Optional[str] = None
    smtp_username: Optional[str] = None
    smtp_password: Optional[str] = None
    is_send_only: Optional[bool] = None
    is_active: Optional[bool] = None


class MailAccountTestBody(BaseModel):
    """Optional overrides for test-before-save (passwords never returned)."""

    imap_host: Optional[str] = None
    imap_port: Optional[int] = Field(None, ge=1, le=65535)
    imap_security: Optional[str] = None
    imap_username: Optional[str] = None
    imap_password: Optional[str] = None
    smtp_host: Optional[str] = None
    smtp_port: Optional[int] = Field(None, ge=1, le=65535)
    smtp_security: Optional[str] = None
    smtp_username: Optional[str] = None
    smtp_password: Optional[str] = None
    is_send_only: Optional[bool] = None
