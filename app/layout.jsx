import './globals.css';

export const metadata = {
  title: 'Bloomtrack',
  description: 'Prospecting tracker',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <head>
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap"
        />
      </head>
      <body className="bg-bg text-charcoal font-sans antialiased">{children}</body>
    </html>
  );
}
