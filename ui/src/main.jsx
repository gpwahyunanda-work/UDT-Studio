import { createRoot } from 'react-dom/client';
import { App } from './components/CompileList.jsx';

// Dipanggil compile/app.js setelah login dan nama analis. Tidak membuat permintaan jaringan sendiri selain lewat `api`.
window.UDTCompile = {
  mount(el, { api, me }) {
    const root = createRoot(el);
    root.render(<App api={api} me={me} host={window} />);
    return () => root.unmount();
  },
};
