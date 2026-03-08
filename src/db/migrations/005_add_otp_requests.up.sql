CREATE TABLE IF NOT EXISTS otp_request (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
  phone_number  VARCHAR(50) NOT NULL,
  purpose       VARCHAR(30) NOT NULL CHECK (purpose IN ('verify-phone', 'reset-password')),
  otp_code      VARCHAR(20) NOT NULL,
  expires_at    TIMESTAMPTZ NOT NULL,
  verified_at   TIMESTAMPTZ,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_otp_request_user_purpose
  ON otp_request(user_id, purpose, created_at DESC);
