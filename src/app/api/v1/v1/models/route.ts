// Re-export from parent v1/models route
// This handles the case where Claude CLI appends /v1 to ANTHROPIC_BASE_URL=http://localhost:3000/api/v1
export { GET } from '../../models/route';
