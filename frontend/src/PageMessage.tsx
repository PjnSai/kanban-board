import { Link } from "react-router-dom";

function PageMessage({ title, message }: { title: string; message: string }) {
  return (
    <div className="max-w-md mx-auto text-center py-16">
      <h2 className="text-xl font-semibold text-slate-800 mb-2">{title}</h2>
      <p className="text-sm text-slate-600 mb-6">{message}</p>
      <Link
        to="/"
        className="bg-blue-600 text-white rounded-lg px-4 py-2 text-sm font-medium hover:bg-blue-700"
      >
        Back to my boards
      </Link>
    </div>
  );
}

export default PageMessage;
