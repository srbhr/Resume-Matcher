"use client";

import { useGlobalStore } from "@/stores/useGlobalStore";

const ProcessingError = () => {
  const { processingError } = useGlobalStore();

  if (!processingError) return null;

  return (
    <div role="alert">
      <p className="text-red-500">
        
Hubo un error al procesar/recuperar los datos. Inténtalo de nuevo.
      </p>
      <pre>Error de detalles: {processingError}</pre>
    </div>
  );
};

export default ProcessingError;
