import axios, { AxiosInstance } from 'axios';
import axiosRetry from 'axios-retry';
import { env } from '../config/env';
import { apiLogger } from '../utils/logger';
import type {
  ApiResponse,
  PackageData,
  SupportMessagePayload,
  MessageType,
  IssueTopic,
  TrackingCheckpoint,
  TrackingResult,
} from './types';

/**
 * Decoupled enterprise client for the OnegoPost external API (https://vop.onegopost.com).
 * No Telegram dependencies — reusable for mobile app, REST API, and web services.
 */
export class OnegoApiClient {
  private readonly http: AxiosInstance;

  constructor(baseURL = env.ONEGOPOST_API_BASE_URL, token = env.ONEGOPOST_API_TOKEN) {
    this.http = axios.create({
      baseURL,
      timeout: 15000,
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        Authorization: `Bearer ${token}`,
      },
    });

    // Automatically retry idempotent requests up to 3 times with exponential delay
    axiosRetry(this.http, {
      retries: 3,
      retryDelay: axiosRetry.exponentialDelay,
      retryCondition: (error) => {
        return (
          axiosRetry.isNetworkOrIdempotentRequestError(error) ||
          (error.response?.status !== undefined && error.response.status >= 500)
        );
      },
      onRetry: (retryCount, error, requestConfig) => {
        apiLogger.warn(
          { retryCount, url: requestConfig.url, message: error.message },
          'Retrying OnegoPost API request',
        );
      },
    });

    // Logging interceptors
    this.http.interceptors.response.use(
      (response) => {
        apiLogger.debug(
          { status: response.status, url: response.config.url },
          'OnegoPost API response received',
        );
        return response;
      },
      (error) => {
        apiLogger.error(
          {
            url: error.config?.url,
            status: error.response?.status,
            data: error.response?.data,
            message: error.message,
          },
          'OnegoPost API request failed',
        );
        return Promise.reject(error);
      },
    );
  }

  /**
   * Query a package by AWB tracking number.
   * Verified endpoint: GET /api/t_Package/{awb}
   */
  async getPackage(awb: string): Promise<PackageData | null> {
    const cleanAwb = encodeURIComponent(awb.trim());
    try {
      const response = await this.http.get<ApiResponse<PackageData>>(`/api/t_Package/${cleanAwb}`);
      if (response.data && (response.data.State === 200 || response.data.Data)) {
        return response.data.Data ?? null;
      }
      return null;
    } catch (error: any) {
      if (error.response?.status === 404) {
        apiLogger.info({ awb }, 'Package not found in OnegoPost API (404)');
        return null;
      }
      apiLogger.error({ awb, error: error.message }, 'Failed to fetch package by AWB');
      return null;
    }
  }

  /**
   * Fetch live tracking timeline for a package.
   * Verified endpoint: GET /api/t_Package/Tracking/{awb}?targetLanguageCode={UZ|RU}
   *
   * Returns the full response shape:
   *   { State: 404|200, Message: "sucess", Data: [{ Time, Content }, ...] }
   *
   * Data[0] is the latest checkpoint (current location), the rest is history.
   */
  async getTracking(awb: string, lang: 'uz' | 'ru' = 'uz'): Promise<TrackingResult | null> {
    const cleanAwb = encodeURIComponent(awb.trim());
    const langCode = lang === 'uz' ? 'UZ' : 'RU';
    try {
      const response = await this.http.get<ApiResponse<TrackingCheckpoint[]>>(
        `/api/t_Package/Tracking/${cleanAwb}`,
        { params: { targetLanguageCode: langCode } },
      );

      const checkpoints = response.data?.Data;

      if (!checkpoints || !Array.isArray(checkpoints) || checkpoints.length === 0) {
        apiLogger.info({ awb, lang }, 'Tracking data empty or not found');
        return null;
      }

      return {
        currentLocation: checkpoints[0].Content,
        currentTime: checkpoints[0].Time,
        history: checkpoints,
      };
    } catch (error: any) {
      if (error.response?.status === 404) {
        apiLogger.info({ awb }, 'Tracking not found in OnegoPost API (404)');
        return null;
      }
      apiLogger.error({ awb, error: error.message }, 'Failed to fetch tracking by AWB');
      return null;
    }
  }

  /**
   * Submit a customer support message / ticket.
   * Verified endpoint: PUT /api/t_Message/userMessage/{FkId}?TYPE={type}&topic={topic}
   */
  async submitMessage(
    fkId: string,
    type: MessageType,
    topic: IssueTopic,
    payload: SupportMessagePayload,
  ): Promise<boolean> {
    const cleanFkId = encodeURIComponent(fkId.trim());
    try {
      const response = await this.http.put<ApiResponse<unknown>>(
        `/api/t_Message/userMessage/${cleanFkId}`,
        payload,
        {
          params: {
            TYPE: type,
            topic,
          },
        },
      );

      const success = response.data?.State === 200 || response.status === 200;
      apiLogger.info(
        { fkId, type, topic, success },
        'Support message submitted to OnegoPost API',
      );
      return success;
    } catch (error: any) {
      apiLogger.error(
        {
          fkId,
          type,
          topic,
          status: error.response?.status,
          data: error.response?.data,
          message: error.message,
        },
        'Failed to submit support message to OnegoPost API',
      );
      return false;
    }
  }
}

export const onegoClient = new OnegoApiClient();
