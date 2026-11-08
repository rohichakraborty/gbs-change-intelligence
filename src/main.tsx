import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './styles.css';

class Boundary extends React.Component<{ children: React.ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) { return { error }; }
  render() {
    if (this.state.error) {
      return (
        <div style={{ padding: 32, maxWidth: 640 }}>
          <h2>Something went wrong in this view</h2>
          <p style={{ color: 'var(--text-2)', margin: '8px 0 16px' }}>{this.state.error.message}. Your engagement data is saved; reload to continue. Use Undo if the last change caused this.</p>
          <button className="btn primary" onClick={() => location.reload()}>Reload</button>
        </div>
      );
    }
    return this.props.children;
  }
}

ReactDOM.createRoot(document.getElementById('root')!).render(<React.StrictMode><Boundary><App /></Boundary></React.StrictMode>);
