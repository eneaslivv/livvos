-- Enable Realtime for client_messages so both admin and client portal
-- receive live message updates via Supabase subscriptions.
ALTER PUBLICATION supabase_realtime ADD TABLE client_messages;
