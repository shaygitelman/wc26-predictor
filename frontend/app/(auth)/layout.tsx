export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative min-h-dvh bg-background flex flex-col items-center justify-center p-6 overflow-x-hidden">

      {/* Ambient glow — top purple bloom */}
      <div
        className="pointer-events-none absolute top-0 left-1/2 -translate-x-1/2"
        style={{
          width: 660, height: 500,
          background: 'radial-gradient(ellipse at 50% 0%, rgba(136,117,255,0.22) 0%, transparent 65%)',
        }}
        aria-hidden="true"
      />

      {/* Ambient glow — bottom gold accent */}
      <div
        className="pointer-events-none absolute bottom-0 left-1/2 -translate-x-1/2"
        style={{
          width: 540, height: 300,
          background: 'radial-gradient(ellipse at 50% 100%, rgba(240,168,12,0.09) 0%, transparent 70%)',
        }}
        aria-hidden="true"
      />

      {/* Subtle dot grid for depth */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          backgroundImage: 'radial-gradient(circle, rgba(136,117,255,0.07) 1px, transparent 1px)',
          backgroundSize: '30px 30px',
          maskImage: 'radial-gradient(ellipse 80% 80% at 50% 50%, black 20%, transparent 100%)',
          WebkitMaskImage: 'radial-gradient(ellipse 80% 80% at 50% 50%, black 20%, transparent 100%)',
        }}
        aria-hidden="true"
      />

      <div className="relative z-10 w-full flex flex-col items-center">
        {children}
      </div>
    </div>
  )
}
