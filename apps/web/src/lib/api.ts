/**
 * CircuitMentor API client.
 * Connects via Vite proxy (/v1 -> http://localhost:8000), using same-origin httpOnly cookie authentication.
 */

export class ApiError extends Error {
  status: number;
  data: unknown;

  constructor(status: number, message: string, data?: unknown) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.data = data;
  }
}

export interface UserProfile {
  id: string;
  email: string;
  display_name: string | null;
  avatar_url: string | null;
  google_sub: string | null;
  created_at: string;
}

export interface ProjectProgress {
  milestones?: Record<string, boolean>;
  hints_used?: number;
  findings_seen?: Record<string, number>;
  completed_at?: string;
}

export interface BackendProject {
  id: string;
  owner_id: string;
  title: string;
  board_type: string;
  goal: string | null;
  circuit_data: {
    v?: number;
    components?: any[];
    wires?: any[];
    [key: string]: any;
  };
  task_id?: string | null;
  progress?: ProjectProgress;
  created_at: string;
  updated_at: string;
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const headers = new Headers(options.headers || {});
  if (options.body && !(options.body instanceof FormData) && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  const response = await fetch(path, {
    ...options,
    headers,
    credentials: 'include',
  });

  if (response.status === 204) {
    return {} as T;
  }

  if (response.status === 401) {
    let errMessage = 'Unauthorized';
    try {
      const errJson = await response.json();
      errMessage = errJson.detail || errMessage;
    } catch {
      // no JSON body
    }
    throw new ApiError(401, errMessage);
  }

  if (!response.ok) {
    let errMessage = `HTTP ${response.status}`;
    let errData: unknown;
    try {
      errData = await response.json();
      if (typeof errData === 'object' && errData !== null && 'detail' in errData) {
        errMessage = String((errData as any).detail);
      }
    } catch {
      errMessage = response.statusText || errMessage;
    }
    throw new ApiError(response.status, errMessage, errData);
  }

  return response.json();
}

export const api = {
  // Auth
  async getMe(): Promise<UserProfile> {
    return request<UserProfile>('/v1/auth/me');
  },

  async logout(): Promise<void> {
    try {
      await request<void>('/v1/auth/google/logout', { method: 'POST' });
    } catch {
      // Ignore network errors on logout redirect
    }
    window.location.href = '/';
  },

  // Projects
  async listProjects(): Promise<BackendProject[]> {
    return request<BackendProject[]>('/v1/projects');
  },

  async getProject(projectId: string): Promise<BackendProject> {
    return request<BackendProject>(`/v1/projects/${projectId}`);
  },

  async createProject(data: {
    title: string;
    board_type?: string;
    goal?: string;
    circuit_data?: Record<string, unknown>;
    task_id?: string | null;
    progress?: ProjectProgress;
  }): Promise<BackendProject> {
    return request<BackendProject>('/v1/projects', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  async updateProject(
    projectId: string,
    data: {
      title?: string;
      board_type?: string;
      goal?: string;
      circuit_data?: Record<string, unknown>;
      task_id?: string | null;
      progress?: ProjectProgress;
    }
  ): Promise<BackendProject> {
    return request<BackendProject>(`/v1/projects/${projectId}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  },

  async deleteProject(projectId: string): Promise<void> {
    return request<void>(`/v1/projects/${projectId}`, {
      method: 'DELETE',
    });
  },
};

