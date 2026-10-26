import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Clock, Save, Settings, Trash2, Plus, ArrowRight, CheckCircle, AlertCircle } from 'lucide-react';
import { LoadingBlock, ErrorBox } from '../../components/shell';
import { apiRequest } from '../../lib/api';
import type { AutosaveSettings, AutosaveSettingsResponse } from '../../lib/types';

export function AutosaveSettingsPage() {
  const queryClient = useQueryClient();

  const { data: settingsData, isLoading, error } = useQuery({
    queryKey: ['autosave-settings'],
    queryFn: async () => {
      const response = await apiRequest<{ settings: AutosaveSettings[] }>('/v1/admin/autosave-settings');
      return response;
    },
  });

  const createMutation = useMutation({
    mutationFn: async (settings: Partial<AutosaveSettings>) => {
      return apiRequest('/v1/admin/autosave-settings', {
        method: 'POST',
        body: settings,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['autosave-settings'] });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, settings }: { id: number; settings: Partial<AutosaveSettings> }) => {
      return apiRequest(`/v1/admin/autosave-settings/${id}`, {
        method: 'PUT',
        body: settings,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['autosave-settings'] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      return apiRequest(`/v1/admin/autosave-settings/${id}`, {
        method: 'DELETE',
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['autosave-settings'] });
    },
  });

  if (isLoading) {
    return (
      <div className="page">
        <LoadingBlock message="Loading autosave settings..." />
      </div>
    );
  }

  if (error) {
    return (
      <div className="page">
        <ErrorBox error={error} />
      </div>
    );
  }

  const settings = settingsData?.settings || [];

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1>Exam Autosave Settings</h1>
          <p>Configure how frequently student answers synchronize with the server</p>
        </div>
        <button className="button button-primary">
          <Plus size={16} />
          Add Exam-Specific Settings
        </button>
      </div>

      <div className="card">
        <div className="card-header">
          <h2>Autosave Configuration</h2>
        </div>
        <div className="card-body">
          {settings.length === 0 ? (
            <div className="empty-state">
              <Settings size={48} />
              <p>No autosave settings configured. Using system defaults.</p>
            </div>
          ) : (
            <div className="settings-list">
              {settings.map((setting) => (
                <AutosaveSettingCard
                  key={setting.id}
                  setting={setting}
                  onUpdate={(newSettings) =>
                    updateMutation.mutate({ id: setting.id!, settings: newSettings })
                  }
                  onDelete={() => setting.id && deleteMutation.mutate(setting.id)}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function AutosaveSettingCard({
  setting,
  onUpdate,
  onDelete,
}: {
  setting: AutosaveSettings;
  onUpdate: (settings: Partial<AutosaveSettings>) => void;
  onDelete: () => void;
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [localSettings, setLocalSettings] = useState(setting);

  const handleSave = () => {
    onUpdate(localSettings);
    setIsEditing(false);
  };

  const formatTime = (seconds: number) => {
    if (seconds < 60) return `${seconds}s`;
    return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
  };

  return (
    <div className="setting-card">
      <div className="setting-header">
        <div className="setting-scope">
          <span className="badge">{setting.scope === 'global' ? 'Global' : 'Exam-Specific'}</span>
          {setting.scope === 'exam' && <span className="text-muted">Exam ID: {setting.scope_id}</span>}
        </div>
        {!setting.active && <span className="badge badge-inactive">Inactive</span>}
      </div>

      {isEditing ? (
        <div className="setting-form">
          <div className="form-grid">
            <div className="form-group">
              <label>Time-based Autosave</label>
              <div className="checkbox-group">
                <input
                  type="checkbox"
                  checked={localSettings.time_based_enabled}
                  onChange={(e) =>
                    setLocalSettings({ ...localSettings, time_based_enabled: e.target.checked })
                  }
                />
                <span>Enable</span>
              </div>
              {localSettings.time_based_enabled && (
                <input
                  type="number"
                  value={localSettings.time_interval_seconds}
                  onChange={(e) =>
                    setLocalSettings({
                      ...localSettings,
                      time_interval_seconds: parseInt(e.target.value) || 300,
                    })
                  }
                  min={30}
                  max={3600}
                />
              )}
              <small className="field-hint">Interval in seconds (30-3600)</small>
            </div>

            <div className="form-group">
              <label>Answer-count Autosave</label>
              <div className="checkbox-group">
                <input
                  type="checkbox"
                  checked={localSettings.answer_count_enabled}
                  onChange={(e) =>
                    setLocalSettings({ ...localSettings, answer_count_enabled: e.target.checked })
                  }
                />
                <span>Enable</span>
              </div>
              {localSettings.answer_count_enabled && (
                <input
                  type="number"
                  value={localSettings.answer_count_threshold}
                  onChange={(e) =>
                    setLocalSettings({
                      ...localSettings,
                      answer_count_threshold: parseInt(e.target.value) || 5,
                    })
                  }
                  min={1}
                  max={100}
                />
              )}
              <small className="field-hint">Trigger after N changed answers (1-100)</small>
            </div>

            <div className="form-group">
              <label>Max Batch Size</label>
              <input
                type="number"
                value={localSettings.max_batch_size}
                onChange={(e) =>
                  setLocalSettings({ ...localSettings, max_batch_size: parseInt(e.target.value) || 50 })
                }
                min={1}
                max={200}
              />
              <small className="field-hint">Maximum answers per batch (1-200)</small>
            </div>

            <div className="form-group">
              <label>Min Sync Interval</label>
              <input
                type="number"
                value={localSettings.min_sync_interval_seconds}
                onChange={(e) =>
                  setLocalSettings({
                    ...localSettings,
                    min_sync_interval_seconds: parseInt(e.target.value) || 30,
                  })
                }
                min={10}
                max={300}
              />
              <small className="field-hint">Minimum time between syncs in seconds (10-300)</small>
            </div>
          </div>

          <div className="form-actions">
            <button className="button button-secondary" onClick={() => setIsEditing(false)}>
              Cancel
            </button>
            <button className="button button-primary" onClick={handleSave}>
              <Save size={16} />
              Save Changes
            </button>
          </div>
        </div>
      ) : (
        <div className="setting-view">
          <div className="setting-grid">
            <div className="setting-item">
              <Clock size={18} />
              <div>
                <strong>Time-based</strong>
                <span className="text-muted">
                  {setting.time_based_enabled ? `Every ${formatTime(setting.time_interval_seconds)}` : 'Disabled'}
                </span>
              </div>
            </div>

            <div className="setting-item">
              <CheckCircle size={18} />
              <div>
                <strong>Answer-count</strong>
                <span className="text-muted">
                  {setting.answer_count_enabled
                    ? `After ${setting.answer_count_threshold} changes`
                    : 'Disabled'}
                </span>
              </div>
            </div>

            <div className="setting-item">
              <ArrowRight size={18} />
              <div>
                <strong>Batch Size</strong>
                <span className="text-muted">{setting.max_batch_size} answers</span>
              </div>
            </div>

            <div className="setting-item">
              <Settings size={18} />
              <div>
                <strong>Min Interval</strong>
                <span className="text-muted">{formatTime(setting.min_sync_interval_seconds)}</span>
              </div>
            </div>
          </div>

          <div className="setting-actions">
            <button className="button button-secondary" onClick={() => setIsEditing(true)}>
              Edit
            </button>
            {setting.scope !== 'global' && (
              <button className="button button-danger" onClick={onDelete}>
                <Trash2 size={16} />
                Delete
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
