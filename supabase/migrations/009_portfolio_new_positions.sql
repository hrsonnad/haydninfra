-- Let a plan entry name a position that is not currently held.
--
-- Rebalancing almost always ends in "sell X, buy Y" where Y is new. Until now
-- an entry could only reference an existing holding, so the buy side of every
-- plan was unrecordable: the amount would not resolve and the before/after
-- view showed the proceeds sitting in cash forever.
--
-- theme lets a new position be placed in the look-through rollups; without it
-- a new holding would be invisible to the exposure charts that the whole
-- exercise is about. price is an optional override for symbols with no live
-- quote (private vehicles, anything the quote proxy cannot resolve).
ALTER TABLE portfolio_plan_entries
  ADD COLUMN IF NOT EXISTS theme TEXT,
  ADD COLUMN IF NOT EXISTS price NUMERIC;
