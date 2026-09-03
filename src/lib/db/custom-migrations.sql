-- Trigger: impedir UPDATE en tasks.due_date_original
CREATE OR REPLACE FUNCTION prevent_due_date_original_update()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.due_date_original IS NOT NULL
     AND NEW.due_date_original IS DISTINCT FROM OLD.due_date_original THEN
    RAISE EXCEPTION 'due_date_original cannot be modified after creation';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_task_due_date_original ON tasks;
CREATE TRIGGER trg_task_due_date_original
  BEFORE UPDATE ON tasks
  FOR EACH ROW EXECUTE FUNCTION prevent_due_date_original_update();

-- Trigger: impedir UPDATE en milestones.target_date_original
CREATE OR REPLACE FUNCTION prevent_target_date_original_update()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.target_date_original IS NOT NULL
     AND NEW.target_date_original IS DISTINCT FROM OLD.target_date_original THEN
    RAISE EXCEPTION 'target_date_original cannot be modified after creation';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_milestone_target_date_original ON milestones;
CREATE TRIGGER trg_milestone_target_date_original
  BEFORE UPDATE ON milestones
  FOR EACH ROW EXECUTE FUNCTION prevent_target_date_original_update();

-- Trigger: auto-update updated_at
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_companies_updated_at ON companies;
CREATE TRIGGER trg_companies_updated_at
  BEFORE UPDATE ON companies FOR EACH ROW EXECUTE FUNCTION update_updated_at();

DROP TRIGGER IF EXISTS trg_persons_updated_at ON persons;
CREATE TRIGGER trg_persons_updated_at
  BEFORE UPDATE ON persons FOR EACH ROW EXECUTE FUNCTION update_updated_at();

DROP TRIGGER IF EXISTS trg_spaces_updated_at ON spaces;
CREATE TRIGGER trg_spaces_updated_at
  BEFORE UPDATE ON spaces FOR EACH ROW EXECUTE FUNCTION update_updated_at();

DROP TRIGGER IF EXISTS trg_tasks_updated_at ON tasks;
CREATE TRIGGER trg_tasks_updated_at
  BEFORE UPDATE ON tasks FOR EACH ROW EXECUTE FUNCTION update_updated_at();

DROP TRIGGER IF EXISTS trg_milestones_updated_at ON milestones;
CREATE TRIGGER trg_milestones_updated_at
  BEFORE UPDATE ON milestones FOR EACH ROW EXECUTE FUNCTION update_updated_at();

DROP TRIGGER IF EXISTS trg_space_templates_updated_at ON space_templates;
CREATE TRIGGER trg_space_templates_updated_at
  BEFORE UPDATE ON space_templates FOR EACH ROW EXECUTE FUNCTION update_updated_at();

DROP TRIGGER IF EXISTS trg_task_templates_updated_at ON task_templates;
CREATE TRIGGER trg_task_templates_updated_at
  BEFORE UPDATE ON task_templates FOR EACH ROW EXECUTE FUNCTION update_updated_at();

DROP TRIGGER IF EXISTS trg_subtasks_updated_at ON subtasks;
CREATE TRIGGER trg_subtasks_updated_at
  BEFORE UPDATE ON subtasks FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Bitácora append-only: crear rol de app si no existe, revocar UPDATE/DELETE
-- Nota: ejecutar esto después de crear las tablas y con un superuser
-- DO $$
-- BEGIN
--   IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_role') THEN
--     CREATE ROLE app_role;
--   END IF;
--   REVOKE UPDATE, DELETE ON audit_log FROM app_role;
-- END $$;
