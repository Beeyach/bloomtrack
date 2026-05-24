import './globals.css';

export const metadata = {
  title: 'Bloomtrack',
  description: 'Prospecting tracker',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <head>
        {/*
          Google Fonts — Bloomwired's type system:
            Instrument Serif → headings (warm, editorial)
            Instrument Sans  → body
            IBM Plex Mono    → labels, counters, tabular numbers
        */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Instrument+Serif:ital@0;1&family=Instrument+Sans:wght@400;500;600;700&family=IBM+Plex+Mono:wght@400;500;600&display=swap"
        />
      </head>
      <body className="bg-paper text-charcoal font-sans antialiased">{children}</body>
    </html>
  );
}
