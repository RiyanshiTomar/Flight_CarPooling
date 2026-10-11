-- Launch airports: Delhi IGI first, then Bengaluru.
INSERT INTO airports (iata, name, city, lat, lng) VALUES
  ('DEL', 'Indira Gandhi International Airport', 'Delhi', 28.5562, 77.1000),
  ('BLR', 'Kempegowda International Airport', 'Bengaluru', 13.1986, 77.7066);

-- Popular drop areas (est_solo_fare is a rough INR estimate, used only for display).
INSERT INTO places (airport_id, label, lat, lng, est_solo_fare)
SELECT a.id, p.label, p.lat, p.lng, p.fare FROM airports a
JOIN (VALUES
  ('DEL', 'Gurugram - Cyber Hub',    28.4950, 77.0890, 920),
  ('DEL', 'Gurugram - Golf Course Rd', 28.4420, 77.1020, 950),
  ('DEL', 'Gurugram - DLF Phase 3',    28.4930, 77.0950, 910),
  ('DEL', 'Noida - Sector 62',       28.6270, 77.3650, 880),
  ('DEL', 'Connaught Place',         28.6315, 77.2167, 560),
  ('DEL', 'Dwarka Sector 21',        28.5520, 77.0580, 420),
  ('DEL', 'Saket',                   28.5245, 77.2066, 520),
  ('DEL', 'Nehru Place',             28.5494, 77.2501, 540),
  ('BLR', 'Whitefield',              12.9698, 77.7500, 1200),
  ('BLR', 'Koramangala',             12.9352, 77.6245, 1400),
  ('BLR', 'Indiranagar',             12.9784, 77.6408, 1300),
  ('BLR', 'Electronic City',         12.8440, 77.6600, 1700),
  ('BLR', 'HSR Layout',              12.9116, 77.6474, 1500),
  ('BLR', 'MG Road',                 12.9756, 77.6070, 1250)
) AS p(iata, label, lat, lng, fare) ON a.iata = p.iata;

