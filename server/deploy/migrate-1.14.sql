-- Additive and repeatable. Back up the database before applying on a live service.
CREATE TABLE IF NOT EXISTS chatq_sync_spaces (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), app_id uuid NOT NULL REFERENCES apps(id),
 space_id varchar(32) NOT NULL, owner_user_id uuid NOT NULL REFERENCES users(id),
 credential_hash varchar(64) NOT NULL, blob text NOT NULL, revision integer NOT NULL DEFAULT 1,
 updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS chatq_sync_app_space ON chatq_sync_spaces(app_id,space_id);
CREATE TABLE IF NOT EXISTS chatq_payment_orders (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),order_no varchar(30) NOT NULL UNIQUE,app_id uuid NOT NULL REFERENCES apps(id),user_id uuid NOT NULL REFERENCES users(id),plan_id uuid NOT NULL REFERENCES subscription_plans(id),
 request_id varchar(80) NOT NULL,name varchar(100) NOT NULL,tier varchar(30) NOT NULL,duration_days integer NOT NULL,
 amount integer NOT NULL,currency varchar(3) NOT NULL,binding varchar(64) NOT NULL,status varchar(20) NOT NULL DEFAULT 'pending',
 transaction_id varchar(64),checkout_url text,created_at timestamptz NOT NULL DEFAULT now(),expires_at timestamptz NOT NULL,paid_at timestamptz
);
CREATE UNIQUE INDEX IF NOT EXISTS chatq_payment_request ON chatq_payment_orders(app_id,user_id,request_id);
CREATE UNIQUE INDEX IF NOT EXISTS chatq_payment_transaction ON chatq_payment_orders(binding,transaction_id);
