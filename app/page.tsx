export default function Home() {
  return (
    <main
      style={{
        minHeight: "100dvh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        paddingTop: "calc(env(safe-area-inset-top, 0px) + 20px)",
      }}
    >
      <div
        style={{
          width: "min(88vw, 360px)",
          aspectRatio: "5 / 4",
          background: "var(--lcd)",
          border: "2px solid var(--lcd-bezel)",
          borderRadius: 6,
          boxShadow: "inset 0 2px 6px rgba(0, 0, 0, 0.25)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <span
          style={{
            fontWeight: 700,
            fontSize: 16,
            color: "var(--pixel)",
          }}
        >
          iPod
        </span>
      </div>
    </main>
  );
}
