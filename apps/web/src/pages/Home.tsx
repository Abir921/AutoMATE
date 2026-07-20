import { Link } from "react-router-dom";
import { getToken } from "../api";

export default function Home() {
  const loggedIn = !!getToken();

  return (
    <div>
      <div className="hero-section">
        <div className="hero-eyebrow">
          <span className="dot rec" /> Record
          <span className="sep">&rarr;</span>
          <span className="dot play" /> Play
        </div>
        <h1>Teach it once. It does the rest.</h1>
        <p className="lead">
          FormAutomator watches you complete a task on any website one time, then turns it into a reusable automation
          and a REST API - no coding required.
        </p>
        <div className="hero-actions">
          <a href="/formautomator-extension.zip" download>
            <button>Download Extension</button>
          </a>
          <Link to={loggedIn ? "/dashboard" : "/login"}>
            <button className="secondary">{loggedIn ? "Go to Dashboard" : "Log in / Sign up"}</button>
          </Link>
        </div>
        <div className="tape-strip" aria-hidden="true">
          {Array.from({ length: 28 }).map((_, i) => (
            <span key={i} style={{ animationDelay: `${i * 35}ms` }} />
          ))}
        </div>
      </div>

      <div className="feature-grid">
        <div className="card">
          <h3>Record a workflow</h3>
          <p className="muted">
            Click the extension, hit Start Recording, and do the task like you always do. It learns every click,
            field, and page you touch.
          </p>
        </div>
        <div className="card">
          <h3>Fill forms automatically</h3>
          <p className="muted">
            The details you typed become a simple form. Change what you need, run it, and it repeats the whole
            workflow with your new values.
          </p>
        </div>
        <div className="card">
          <h3>Extract information</h3>
          <p className="muted">
            Mark the pieces of info you care about while recording - price, dates, confirmation numbers - and get
            them back as structured data every run.
          </p>
        </div>
      </div>

      <div className="card" style={{ marginTop: 16 }}>
        <h3>Installing the extension</h3>
        <p className="muted">
          The extension isn't on the Chrome Web Store yet, so it installs in developer mode - takes under a minute:
        </p>
        <ol className="steps muted">
          <li>Download the extension above and unzip it.</li>
          <li>
            Open <code>chrome://extensions</code> in Chrome.
          </li>
          <li>Turn on Developer mode (top right).</li>
          <li>
            Click <strong>Load unpacked</strong> and select the unzipped folder.
          </li>
          <li>Sign in below, then click the extension icon on any website to start recording.</li>
        </ol>
      </div>
    </div>
  );
}
