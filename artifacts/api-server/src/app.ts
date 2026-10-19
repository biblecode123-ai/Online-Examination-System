import express, { type Express, type Request, type Response } from "express";
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
  onProxyReq: (proxyReq: any, req: Request, res: Response) => {
    // Forward all headers from the original request
    if (req.headers['authorization']) {
      proxyReq.setHeader('Authorization', req.headers['authorization']);
    }
  },
  onProxyRes: (proxyRes: any, req: Request, res: Response) => {
    // Add CORS headers to the response
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  },
  onError: (err: any, req: Request, res: Response) => {
    console.error('Proxy error:', err);
    res.status(500).json({
      success: false,
      message: 'Proxy error',
      error: err.message,
    });
  },
}));

// Health check route (not proxied)
app.use(router);

export default app;
