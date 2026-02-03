import React, { useEffect } from "react";

type DeleteArtistModalState = {
  open: boolean;
  artistIds: number[];
  label: string;
};

type DeleteArtistModalProps = {
  modal: DeleteArtistModalState;
  onClose: () => void;
  onConfirm: () => void | Promise<unknown>;
};

export const DeleteArtistModal = ({ modal, onClose, onConfirm }: DeleteArtistModalProps) => {
  useEffect(() => {
    if (!modal.open) {
      return;
    }
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key === "Enter") {
        event.preventDefault();
        void onConfirm();
      }
    };
    window.addEventListener("keydown", handleKey);
    return () => {
      window.removeEventListener("keydown", handleKey);
    };
  }, [modal.open, onClose, onConfirm]);

  if (!modal.open) return null;

  return (
    <div
      className="fixed inset-0 z-40 flex items-center justify-center bg-slate-900/60 px-4 py-6"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="text-lg font-semibold text-slate-900">
          {modal.artistIds.length > 1 ? "Delete artists?" : "Delete artist?"}
        </div>
        <p className="mt-2 text-sm text-slate-600">
          This will remove {modal.label} and any downloaded files. This action cannot be undone.
        </p>
        <div className="mt-5 flex items-center justify-end gap-2">
          <button
            onClick={onClose}
            className="rounded-lg border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50"
          >
            Cancel
          </button>
          <button
            onClick={() => void onConfirm()}
            className="rounded-lg bg-rose-600 px-4 py-2 text-xs font-semibold text-white hover:bg-rose-500"
          >
            Delete
          </button>
        </div>
      </div>
    </div>
  );
};

