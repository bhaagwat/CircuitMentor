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

const API_BASE = (import.meta.env.VITE_API_URL || '').replace(/\/$/, '');

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const url = path.startsWith('http') ? path : `${API_BASE}${path}`;
  const headers = new Headers(options.headers || {});
  if (options.body && !(options.body instanceof FormData) && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  const execute = async () => {
    try {
      return await fetch(url, {
        ...options,
        headers,
        credentials: 'include',
      });
    } catch (networkErr: any) {
      throw new ApiError(0, `Network error: ${networkErr.message || 'Failed to reach API server'}`);
    }
  };

  let response: Response;
  try {
    response = await execute();
  } catch (err) {
    if (err instanceof ApiError && err.status === 0) {
      // Retry once after 500ms backoff
      await new Promise((resolve) => setTimeout(resolve, 500));
      response = await execute();
    } else {
      throw err;
    }
  }

  if (response.status === 204) {
    return {} as T;
  }

  if (response.status === 401) {
    let errMessage = 'Session expired. Please log in again.';
    try {
      const errJson = await response.json();
      errMessage = errJson.detail || errMessage;
    } catch {
      // no JSON body
    }
    throw new ApiError(401, errMessage);
  }

  if (response.status === 413) {
    throw new ApiError(413, 'Circuit payload is too large to save.');
  }

  if (response.status === 422) {
    let errMessage = 'Invalid circuit format';
    try {
      const errJson = await response.json();
      if (Array.isArray(errJson.detail)) {
        errMessage = errJson.detail.map((d: any) => d.msg || JSON.stringify(d)).join(', ');
      } else if (errJson.detail) {
        errMessage = String(errJson.detail);
      }
    } catch {
      // no JSON body
    }
    throw new ApiError(422, `Validation failed: ${errMessage}`);
  }

  if (response.status >= 500) {
    let errMessage = 'Internal server error while saving';
    try {
      const errJson = await response.json();
      errMessage = errJson.detail || errMessage;
    } catch {
      // no JSON body
    }
    throw new ApiError(response.status, `Server error (${response.status}): ${errMessage}`);
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

