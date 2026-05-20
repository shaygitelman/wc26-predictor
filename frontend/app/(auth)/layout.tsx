export default function AuthLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="min-h-dvh bg-background flex flex-col items-center justify-center p-6">
      {children}
    </div>
  )
}
