-- Mock feedback data (realistic PM scenarios)
INSERT INTO feedback (source, content, user_type, category) VALUES
('GitHub', 'Workers AI timeout after 30 seconds on large model inference', 'enterprise', 'performance'),
('Discord', 'D1 migration docs are confusing, no clear rollback strategy', 'developer', 'documentation'),
('Support', 'Billing spike without warning - need better cost alerts', 'enterprise', 'billing'),
('Twitter', 'Love the new Workflows product but local testing is impossible', 'developer', 'dx'),
('GitHub', 'API rate limits too aggressive for legitimate use cases', 'enterprise', 'performance'),
('Discord', 'Wrangler deploy failed silently - no error message', 'developer', 'dx'),
('Support', 'R2 upload speeds slow from Asia - 3x slower than S3', 'enterprise', 'performance'),
('GitHub', 'Workers AI Llama responses inconsistent quality', 'developer', 'quality'),
('Discord', 'Need better way to test D1 locally without remote calls', 'developer', 'dx'),
('Support', 'Enterprise support response time > 24hrs for P1 issue', 'enterprise', 'support'),
('Twitter', 'KV eventually consistent causing race conditions in prod', 'developer', 'reliability'),
('GitHub', 'Workflows pricing unclear - worried about surprise bills', 'enterprise', 'billing'),
('Discord', 'Dashboard UI slow when viewing logs - times out frequently', 'developer', 'dx'),
('Support', 'Certificate renewal failed without notification', 'enterprise', 'reliability'),
('GitHub', 'Workers AI model selection guide missing - which to use?', 'developer', 'documentation');

