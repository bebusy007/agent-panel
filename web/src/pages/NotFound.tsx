import { Link } from "react-router-dom";

export default function NotFound() {
  return (
    <div className="py-16 text-center">
      <h1 className="text-3xl font-semibold tracking-tight">404</h1>
      <p className="text-sm text-muted-foreground mt-2">页面不存在</p>
      <Link to="/" className="text-sm text-accent mt-4 inline-block">
        返回概览
      </Link>
    </div>
  );
}
