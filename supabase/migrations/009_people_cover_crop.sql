-- People-tab cover thumbnails: store a pre-cropped square face per person.
--
-- Before this, `people.cover_photo` pointed at a whole photo and the browser
-- tried to zoom into `cover_bbox` with a hardcoded CSS scale(1.6). The median
-- cover face spans 9.8% of its photo, so filling an 84px circle needs ~6x --
-- the tab rendered 115 group shots instead of 115 faces. The pipeline now cuts
-- a real square crop (320px, padded around the detector box) and uploads it to
-- R2 under faces/; this column holds that key. cover_photo/cover_bbox stay as a
-- fallback for rows whose crop has not been generated yet.

ALTER TABLE people ADD COLUMN IF NOT EXISTS cover_key TEXT;

-- Written by the pipeline: a cluster whose best available face is still tiny or
-- low-confidence is not a person you could name, so it is kept out of the tab.
-- (The worst offender was a 579-face cluster of dogs, motion-blurred video
-- frames and background strangers that sorted to position #1.)
ALTER TABLE people ADD COLUMN IF NOT EXISTS cover_quality REAL;

COMMENT ON COLUMN people.cover_key IS
  'R2 key of the pre-cropped square face crop (faces/<sha1>.webp).';
COMMENT ON COLUMN people.cover_quality IS
  'Score of the chosen cover face; NULL means no crop generated yet.';
