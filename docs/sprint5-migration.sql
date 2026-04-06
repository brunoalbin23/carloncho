-- Sprint 5 migration: disconnected presence flag
ALTER TABLE jugadores
ADD COLUMN IF NOT EXISTS ausente BOOLEAN DEFAULT false;
