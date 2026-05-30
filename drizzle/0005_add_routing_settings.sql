-- Add routing configuration settings
INSERT OR IGNORE INTO settings (key, value) VALUES
  -- Routing configuration
  ('enable_smart_routing', 'true'),
  ('enable_extended_thinking', 'false'),
  ('enable_prompt_caching', 'true'),
  ('offline_first_mode', 'false'),
  
  -- Budget configuration
  ('budget_daily', '1000'), -- $10.00 in cents
  ('budget_weekly', '5000'), -- $50.00 in cents
  ('budget_monthly', '20000'), -- $200.00 in cents
  ('budget_alert_thresholds', '[0.5, 0.8, 1.0]'),
  ('budget_auto_downgrade', 'false'),
  
  -- Cache configuration
  ('cache_system_prompt_threshold', '1024'),
  ('cache_user_message_threshold', '2048'),
  
  -- Extended Thinking configuration
  ('extended_thinking_context_threshold', '50000'),
  ('extended_thinking_complexity_threshold', '80'),
  
  -- Performance configuration
  ('routing_cache_ttl', '300'), -- 5 minutes
  ('config_cache_ttl', '300'); -- 5 minutes
