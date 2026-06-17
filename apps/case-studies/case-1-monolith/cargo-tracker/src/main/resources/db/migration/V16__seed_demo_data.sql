-- デモ用シードデータ（荷主・貨物・経路区間）
-- case-2 のシード（V3/V4 相当）をモノリス構成に合わせて投入する。
-- Flyway により全環境（k8s / docker-compose / ローカル）で一度だけ適用される。
-- 港湾は V2__location.sql、航海は V9__add_voyage.sql の既存マスタを参照する。

-- 荷主（shipper）
-- CORPORATE は契約番号（contract_number）と割引率（discount_rate）がドメイン上必須。
-- INDIVIDUAL は両方とも持たない（NULL）。欠落すると一覧表示時の復元で検証エラーになる。
INSERT INTO shipper (id, shipper_code, shipper_type, name, email, phone, contract_number, discount_rate) VALUES
    ('11111111-1111-1111-1111-111111110001', 'SHP001', 'CORPORATE',  '東京海運株式会社',     'info@tokyo-kaiun.example.com',   '03-1000-0001', 'CT-2024-001', 0.0500),
    ('11111111-1111-1111-1111-111111110002', 'SHP002', 'CORPORATE',  '大阪貿易商事',         'trade@osaka-boeki.example.com',  '06-1000-0002', 'CT-2024-002', 0.0300),
    ('11111111-1111-1111-1111-111111110003', 'SHP003', 'INDIVIDUAL', '田中物流',             'tanaka@tanaka-butsuryu.example.com', NULL,       NULL,          NULL);

-- 貨物（cargo）
-- REFRIGERATED は温度要件（min/max/unit）、HAZARDOUS は危険物申告（class/UN番号/品名）が
-- ドメイン上必須のため、該当行に設定する（欠落すると一覧表示時の復元で検証エラーになる）。
-- PRELIMINARY: 仮予約（経路未割当）
INSERT INTO cargo (booking_id, shipper_id, cargo_type, weight, origin_unlocode, destination_unlocode, arrival_deadline, booking_status,
                   min_temperature, max_temperature, temperature_unit, hazardous_class, un_number, proper_shipping_name) VALUES
    ('22222222-2222-2222-2222-222222220001', '11111111-1111-1111-1111-111111110001', 'GENERAL',      500.000,  'JPTYO', 'CNSHA', '2030-03-31', 'PRELIMINARY', NULL,   NULL,  NULL,      NULL, NULL,     NULL),
    ('22222222-2222-2222-2222-222222220002', '11111111-1111-1111-1111-111111110001', 'REFRIGERATED', 200.000,  'JPTYO', 'SGSIN', '2030-04-15', 'PRELIMINARY', -20.000, -10.000, 'CELSIUS', NULL, NULL,     NULL),
    ('22222222-2222-2222-2222-222222220003', '11111111-1111-1111-1111-111111110002', 'GENERAL',      1200.000, 'CNSHA', 'NLRTM', '2030-05-01', 'PRELIMINARY', NULL,   NULL,  NULL,      NULL, NULL,     NULL);

-- ROUTE_PROPOSED: 経路提案済み
INSERT INTO cargo (booking_id, shipper_id, cargo_type, weight, origin_unlocode, destination_unlocode, arrival_deadline, booking_status,
                   min_temperature, max_temperature, temperature_unit, hazardous_class, un_number, proper_shipping_name) VALUES
    ('22222222-2222-2222-2222-222222220004', '11111111-1111-1111-1111-111111110001', 'GENERAL',   800.000, 'JPTYO', 'CNSHA', '2030-03-15', 'ROUTE_PROPOSED', NULL, NULL, NULL, NULL, NULL,     NULL),
    ('22222222-2222-2222-2222-222222220005', '11111111-1111-1111-1111-111111110002', 'HAZARDOUS', 300.000, 'JPTYO', 'USLAX', '2030-04-30', 'ROUTE_PROPOSED', NULL, NULL, NULL, '3',  'UN1203', '引火性液体');

-- CONFIRMED: 確定済み
INSERT INTO cargo (booking_id, shipper_id, cargo_type, weight, origin_unlocode, destination_unlocode, arrival_deadline, booking_status,
                   min_temperature, max_temperature, temperature_unit, hazardous_class, un_number, proper_shipping_name) VALUES
    ('22222222-2222-2222-2222-222222220006', '11111111-1111-1111-1111-111111110001', 'GENERAL',      600.000, 'JPTYO', 'CNSHA', '2030-02-28', 'CONFIRMED', NULL,  NULL, NULL,      NULL, NULL,     NULL),
    ('22222222-2222-2222-2222-222222220007', '11111111-1111-1111-1111-111111110002', 'GENERAL',      450.000, 'JPTYO', 'USNYC', '2030-03-10', 'CONFIRMED', NULL,  NULL, NULL,      NULL, NULL,     NULL),
    ('22222222-2222-2222-2222-222222220008', '11111111-1111-1111-1111-111111110001', 'REFRIGERATED', 250.000, 'JPTYO', 'USNYC', '2030-03-20', 'CONFIRMED', 2.000, 8.000, 'CELSIUS', NULL, NULL,     NULL);

-- 経路区間（leg）: ROUTE_PROPOSED / CONFIRMED な貨物に既存航海（V001-V003）を割り当てる
-- DEMO...04: JPTYO -> CNSHA (V002 1 区間目)
INSERT INTO leg (cargo_id, voyage_number, load_location_unlocode, unload_location_unlocode, load_time, unload_time, seq_number)
SELECT id, 'V002', 'JPTYO', 'CNSHA', '2026-05-15 10:00:00', '2026-05-22 08:00:00', 1
FROM cargo WHERE booking_id = '22222222-2222-2222-2222-222222220004';

-- DEMO...05: JPTYO -> USLAX (V003 直行便)
INSERT INTO leg (cargo_id, voyage_number, load_location_unlocode, unload_location_unlocode, load_time, unload_time, seq_number)
SELECT id, 'V003', 'JPTYO', 'USLAX', '2026-05-20 08:00:00', '2026-06-05 18:00:00', 1
FROM cargo WHERE booking_id = '22222222-2222-2222-2222-222222220005';

-- DEMO...06: JPTYO -> CNSHA (V002 1 区間目)
INSERT INTO leg (cargo_id, voyage_number, load_location_unlocode, unload_location_unlocode, load_time, unload_time, seq_number)
SELECT id, 'V002', 'JPTYO', 'CNSHA', '2026-05-15 10:00:00', '2026-05-22 08:00:00', 1
FROM cargo WHERE booking_id = '22222222-2222-2222-2222-222222220006';

-- DEMO...07: JPTYO -> USNYC (V001 直行便)
INSERT INTO leg (cargo_id, voyage_number, load_location_unlocode, unload_location_unlocode, load_time, unload_time, seq_number)
SELECT id, 'V001', 'JPTYO', 'USNYC', '2026-05-10 09:00:00', '2026-06-10 14:00:00', 1
FROM cargo WHERE booking_id = '22222222-2222-2222-2222-222222220007';

-- DEMO...08: JPTYO -> CNSHA -> USNYC (V002 2 区間)
INSERT INTO leg (cargo_id, voyage_number, load_location_unlocode, unload_location_unlocode, load_time, unload_time, seq_number)
SELECT id, 'V002', 'JPTYO', 'CNSHA', '2026-05-15 10:00:00', '2026-05-22 08:00:00', 1
FROM cargo WHERE booking_id = '22222222-2222-2222-2222-222222220008';
INSERT INTO leg (cargo_id, voyage_number, load_location_unlocode, unload_location_unlocode, load_time, unload_time, seq_number)
SELECT id, 'V002', 'CNSHA', 'USNYC', '2026-05-24 12:00:00', '2026-06-20 16:00:00', 2
FROM cargo WHERE booking_id = '22222222-2222-2222-2222-222222220008';
