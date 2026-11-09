# zod 4 uuid exige UUID v4 reales en tests

z.string().uuid() en zod 4 valida versión y variante, así que en tests usar crypto.randomUUID() y no literales como '00000000-0000-0000-0000-000000000001'. Los ids de BD (gen_random_uuid) son v4 y no hay problema en producción.

_Origen: retrospectiva de «Validar con zod el PATCH de /api/notifications y marcar como leídas en una sola consulta» (20261109-230638-0cd61e2103)_
