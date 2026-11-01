import { bootstrapApplication } from '@angular/platform-browser';
import { appConfig } from './app/app.config';
import { App } from './app/app';

function loadBenchmarkWorkload(): void {
  const workload = new URLSearchParams(window.location.search).get('workload');
  if (!workload || workload === 'light') return;

  const script = document.createElement('script');
  script.src = `/benchmark-assets/workload.js?workload=${encodeURIComponent(workload)}`;
  document.head.append(script);
}

bootstrapApplication(App, appConfig)
  .then(loadBenchmarkWorkload)
  .catch((err) => console.error(err));
