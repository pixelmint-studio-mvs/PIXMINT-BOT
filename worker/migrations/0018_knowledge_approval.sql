-- Migration 0018: Knowledge Source Status and Approval Schema
-- Adds status column to knowledge_documents for granular administrative approval and deactivation.

ALTER TABLE knowledge_documents ADD COLUMN status TEXT NOT NULL DEFAULT 'approved';
CREATE INDEX IF NOT EXISTS idx_knowledge_documents_status ON knowledge_documents(status);
