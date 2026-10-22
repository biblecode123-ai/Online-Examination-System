import express, { type Express } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import { createProxyMiddleware } from "http-proxy-middleware";
import router from "./routes";
import { logger } from "./lib/logger";

const app: Express = express();

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);

// Allow CORS from any origin (for development)
app.use(cors({
  origin: '*',
  credentials: true,
}));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Proxy all /api requests to production backend
const PROXY_TARGET = process.env.PROXY_TARGET || 'https://2019api.ofijan.com';

app.use('/api', createProxyMiddleware({
  target: PROXY_TARGET,
  changeOrigin: true,
  pathRewrite: {
    '^/api': '/api',
  },
  on: {
    proxyReq: (proxyReq, req) => {
      // Forward all headers from the original request
      if (req.headers['authorization']) {
        proxyReq.setHeader('Authorization', req.headers['authorization']);
      }
    },
    proxyRes: (_proxyRes, _req, res) => {
      // Add CORS headers to the response
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    },
    error: (err, _req, res) => {
      console.error('Proxy error:', err);
      // `res` is a raw ServerResponse (or a socket); respond with the plain HTTP API.
      if (!('headersSent' in res) || res.headersSent) {
        return;
      }
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        success: false,
        message: 'Proxy error',
        error: err.message,
      }));
    },
  },
}));

// Health check route (not proxied)
app.use(router);

export default app;
