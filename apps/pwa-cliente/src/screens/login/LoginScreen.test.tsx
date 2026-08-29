// @vitest-environment jsdom
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { LoginScreen } from './LoginScreen';
import { ApiError } from '../../api/client';
import { BrowserRouter } from 'react-router-dom';

const mockLogin = vi.fn();
vi.mock('../../store/auth.store', () => ({
  useAuthStore: (s: any) => s({ login: mockLogin })
}));

const mockNavigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useNavigate: () => mockNavigate
  };
});

describe('LoginScreen', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const renderScreen = () => render(
    <BrowserRouter>
      <LoginScreen />
    </BrowserRouter>
  );

  it('renders login form', () => {
    renderScreen();
    expect(screen.getByText('Iniciar sesión')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('tu@la-barra-del-ceviche.pe')).toBeInTheDocument();
    expect(screen.getByText(/Max Alessandro García López/)).toBeInTheDocument();
    expect(screen.getByPlaceholderText('••••••••')).toBeInTheDocument();
  });

  it('toggles password visibility', () => {
    renderScreen();
    const passInput = screen.getByPlaceholderText('••••••••');
    const toggleBtn = screen.getByLabelText('Mostrar contraseña');
    
    expect(passInput).toHaveAttribute('type', 'password');
    fireEvent.click(toggleBtn);
    expect(passInput).toHaveAttribute('type', 'text');
    
    const hideBtn = screen.getByLabelText('Ocultar contraseña');
    fireEvent.click(hideBtn);
    expect(passInput).toHaveAttribute('type', 'password');
  });

  it('submits successfully and navigates', async () => {
    mockLogin.mockResolvedValueOnce(true);
    renderScreen();
    
    fireEvent.change(screen.getByPlaceholderText('tu@la-barra-del-ceviche.pe'), { target: { value: 'test@test.com' } });
    fireEvent.change(screen.getByPlaceholderText('••••••••'), { target: { value: '123456' } });
    
    fireEvent.click(screen.getByRole('button', { name: /Ingresar/i }));
    
    expect(mockLogin).toHaveBeenCalledWith({ email: 'test@test.com', password: '123456' });
    
    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith('/app', { replace: true });
    });
  });

  it('handles 401 ApiError', async () => {
    mockLogin.mockRejectedValueOnce(new ApiError(401, 'Unauth', {}));
    renderScreen();
    
    fireEvent.submit(screen.getByRole('button', { name: /Ingresar/i }).closest('form')!);
    
    expect(await screen.findByText('Credenciales inválidas. Verifica tu correo y contraseña.')).toBeInTheDocument();
  });

  it('handles 429 ApiError', async () => {
    mockLogin.mockRejectedValueOnce(new ApiError(429, 'Rate limit', {}));
    renderScreen();
    
    fireEvent.submit(screen.getByRole('button', { name: /Ingresar/i }).closest('form')!);
    
    expect(await screen.findByText('Demasiadas solicitudes. Intenta en unos segundos.')).toBeInTheDocument();
  });

  it('handles other ApiError', async () => {
    mockLogin.mockRejectedValueOnce(new ApiError(500, 'Server error', { message: 'Server error' }));
    renderScreen();
    
    fireEvent.submit(screen.getByRole('button', { name: /Ingresar/i }).closest('form')!);
    
    expect(await screen.findByText('Server error')).toBeInTheDocument();
  });
  
  it('handles other ApiError without message', async () => {
    mockLogin.mockRejectedValueOnce(new ApiError(500, '', {}));
    renderScreen();
    
    fireEvent.submit(screen.getByRole('button', { name: /Ingresar/i }).closest('form')!);
    
    expect(await screen.findByText('Error del servidor. Reintenta en un momento.')).toBeInTheDocument();
  });

  it('handles non-ApiError', async () => {
    mockLogin.mockRejectedValueOnce(new Error('Network error'));
    renderScreen();
    
    fireEvent.submit(screen.getByRole('button', { name: /Ingresar/i }).closest('form')!);
    
    expect(await screen.findByText('No se pudo conectar al servidor. Verifica tu conexión.')).toBeInTheDocument();
  });
});
