import type { RequestHandler } from "express";
import type { IAnalyticsService } from "../../services/analytics/analytics.service";
import type { IDashboardService } from "../../services/dashboard/dashboard.service";
import { asyncHandler } from "../../utils/async-handler";
import { sendData } from "../response";

export class AnalyticsController {
  constructor(
    private readonly analyticsService: IAnalyticsService,
    private readonly dashboardService: IDashboardService,
  ) {}

  getAnalytics: RequestHandler = asyncHandler(async (_req, res) => {
    const analytics = await this.analyticsService.getAnalytics();
    sendData(res, analytics);
  });

  getDashboard: RequestHandler = asyncHandler(async (_req, res) => {
    const dashboard = await this.dashboardService.getDashboard();
    sendData(res, dashboard);
  });
}
