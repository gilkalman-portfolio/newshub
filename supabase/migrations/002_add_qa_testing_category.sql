-- Add qa-testing to the allowed categories
ALTER TABLE articles DROP CONSTRAINT IF EXISTS articles_category_check;

ALTER TABLE articles
  ADD CONSTRAINT articles_category_check
  CHECK (category IN ('ai-builders', 'tech', 'economy', 'news', 'sports', 'qa-testing'));

COMMENT ON COLUMN articles.category IS 'One of: ai-builders | tech | economy | news | sports | qa-testing';
