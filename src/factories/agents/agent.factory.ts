import { createDeepAgent, CreateDeepAgentParams } from 'deepagents';
import { IAgent } from '../../interfaces/agent.interface';

/**
 * Factory interne : instancie un DeepAgent depuis des CreateDeepAgentParams.
 * Retourne une IAgent opaque — les utilisateurs ne voient jamais DeepAgent.
 * @internal Utilisé par AgentService — ne pas utiliser directement.
 */
export class AgentFactory {
  createAgent(id: string, params: CreateDeepAgentParams): IAgent {
    const internal = createDeepAgent(params as any);
    return { id, _internal: internal };
  }
}
