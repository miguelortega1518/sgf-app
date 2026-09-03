import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="h-full flex items-center justify-center bg-gray-50">
      <div className="text-center max-w-md px-6">
        <p className="text-6xl font-bold text-gray-200 mb-4">404</p>
        <h2 className="text-lg font-semibold text-gray-900 mb-2">Página no encontrada</h2>
        <p className="text-sm text-gray-500 mb-6">
          La página que buscas no existe o fue movida.
        </p>
        <Link
          href="/mi-trabajo"
          className="inline-flex px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors"
        >
          Ir al inicio
        </Link>
      </div>
    </div>
  );
}
