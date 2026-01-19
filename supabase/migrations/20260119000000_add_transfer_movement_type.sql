-- Add 'transfer_out' and 'transfer_in' to movement_type enum
ALTER TYPE public.movement_type ADD VALUE IF NOT EXISTS 'transfer_out';
ALTER TYPE public.movement_type ADD VALUE IF NOT EXISTS 'transfer_in';

-- Add column to link transfer movements (origin links to destination and vice versa)
ALTER TABLE public.movements 
  ADD COLUMN IF NOT EXISTS linked_movement_id uuid REFERENCES public.movements(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS movements_linked_movement_id_idx ON public.movements(linked_movement_id);

COMMENT ON COLUMN public.movements.linked_movement_id IS 'For transfers: links the transfer_out movement to its corresponding transfer_in movement';
