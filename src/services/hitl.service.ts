import { Injectable, Logger } from '@nestjs/common';
import { EventEmitter } from 'events';
import { IHumanInTheLoopConfig, IInterruptDecision, IInterruptPayload } from '../interfaces/hitl.interface';

/**
 * Service de gestion du Human-in-the-Loop (HITL).
 *
 * Lors d'une interruption LangGraph, l'agent suspend son exécution et émet
 * un événement 'interrupt'. L'application hôte écoute cet événement,
 * présente la demande à l'humain, puis appelle `resume()` avec la décision.
 */
@Injectable()
export class HitlService extends EventEmitter {
  private readonly logger = new Logger(HitlService.name);
  private readonly pendingInterrupts = new Map<
    string,
    (decision: IInterruptDecision) => void
  >();

  /**
   * Enregistre une interruption en attente de décision humaine.
   * Retourne une Promise résolue quand l'humain prend sa décision.
   *
   * @internal Appelé par AgentService lors d'une interruption LangGraph
   */
  async waitForHumanDecision(payload: Omit<IInterruptPayload, 'resolve'>): Promise<IInterruptDecision> {
    return new Promise<IInterruptDecision>((resolve) => {
      const key = `${payload.threadId}:${payload.toolName}`;
      this.pendingInterrupts.set(key, resolve);

      const fullPayload: IInterruptPayload = { ...payload, resolve };
      this.emit('interrupt', fullPayload);
      this.logger.debug(`[AiKit] HITL : interruption en attente — thread=${payload.threadId} outil=${payload.toolName}`);
    });
  }

  /**
   * Résout une interruption en cours.
   * À appeler par l'application hôte après décision humaine.
   *
   * @param threadId  Identifiant du thread concerné
   * @param toolName  Nom de l'outil interrompu
   * @param decision  Décision prise par l'humain
   */
  resume(threadId: string, toolName: string, decision: IInterruptDecision): void {
    const key = `${threadId}:${toolName}`;
    const resolve = this.pendingInterrupts.get(key);
    if (!resolve) {
      this.logger.warn(`[AiKit] HITL : aucune interruption en attente pour thread=${threadId} outil=${toolName}`);
      return;
    }
    this.pendingInterrupts.delete(key);
    resolve(decision);
  }

  /**
   * Retourne true s'il existe une interruption en attente pour ce thread.
   */
  hasPendingInterrupt(threadId: string): boolean {
    for (const key of this.pendingInterrupts.keys()) {
      if (key.startsWith(`${threadId}:`)) return true;
    }
    return false;
  }

  /**
   * Convertit IHumanInTheLoopConfig en format interruptOn accepté par deepagents.
   * @internal
   */
  _buildInterruptOn(config?: IHumanInTheLoopConfig): Record<string, boolean> | undefined {
    if (!config?.interruptOn) return undefined;
    const result: Record<string, boolean> = {};
    for (const [tool, value] of Object.entries(config.interruptOn)) {
      if (typeof value === 'boolean') {
        result[tool] = value;
      } else {
        result[tool] = value.enabled;
      }
    }
    return result;
  }
}
