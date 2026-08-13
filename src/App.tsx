import React from 'react';
import { Button } from '@/components/ui/button';

const App: React.FC = () => {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-6 bg-background text-foreground">
      <div className="flex flex-col items-center gap-2">
        <h1 className="text-4xl font-bold">Hello Electron + React!</h1>
        <p className="text-muted-foreground">
          Powered by Electron Forge, Vite, React, Tailwind CSS and shadcn/ui
        </p>
      </div>
      <div className="flex gap-3">
        <Button>Default</Button>
        <Button variant="secondary">Secondary</Button>
        <Button variant="outline">Outline</Button>
        <Button variant="ghost">Ghost</Button>
        <Button variant="destructive">Destructive</Button>
        <Button variant="link">Link</Button>
      </div>
    </div>
  );
};

export default App;