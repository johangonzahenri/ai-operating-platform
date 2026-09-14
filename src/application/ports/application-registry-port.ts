import { ExternalApplication } from "../../domain/application/external-application.js";
import { ApplicationProjection, ApplicationQueryPort } from "./query-ports.js";

export interface ApplicationRegistryPort extends ApplicationQueryPort {
  register(application: ExternalApplication): ExternalApplication;
  update(application: ExternalApplication): ExternalApplication;
  delete(id: string): boolean;
  findByTenant(tenantId: string): readonly ExternalApplication[];
  findEntityById(id: string): ExternalApplication | undefined;
}
