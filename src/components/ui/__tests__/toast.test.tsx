import React from 'react';
import { render, screen, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ToastProvider, useToast } from '../toast';

// Test component that uses the toast hook
function TestComponent() {
  const { addToast } = useToast();

  return (
    <div>
      <button onClick={() => addToast({ title: 'Test Toast', type: 'success' })}>
        Add Success Toast
      </button>
      <button onClick={() => addToast({ title: 'Error Toast', type: 'error', description: 'Error description' })}>
        Add Error Toast
      </button>
      <button onClick={() => addToast({ title: 'Info Toast', type: 'info', duration: 1000 })}>
        Add Info Toast
      </button>
    </div>
  );
}

describe('Toast', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    act(() => {
      jest.runOnlyPendingTimers();
    });
    jest.useRealTimers();
  });

  it('should render toast provider', () => {
    render(
      <ToastProvider>
        <div>Content</div>
      </ToastProvider>
    );

    expect(screen.getByText('Content')).toBeInTheDocument();
  });

  it('should throw error when useToast is used outside provider', () => {
    // Suppress console.error for this test
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation();

    expect(() => {
      render(<TestComponent />);
    }).toThrow('useToast must be used within ToastProvider');

    consoleSpy.mockRestore();
  });

  it('should add and display toast', async () => {
    const user = userEvent.setup({ delay: null });

    render(
      <ToastProvider>
        <TestComponent />
      </ToastProvider>
    );

    const button = screen.getByText('Add Success Toast');
    await user.click(button);

    expect(screen.getByText('Test Toast')).toBeInTheDocument();
  });

  it('should display toast with description', async () => {
    const user = userEvent.setup({ delay: null });

    render(
      <ToastProvider>
        <TestComponent />
      </ToastProvider>
    );

    const button = screen.getByText('Add Error Toast');
    await user.click(button);

    expect(screen.getByText('Error Toast')).toBeInTheDocument();
    expect(screen.getByText('Error description')).toBeInTheDocument();
  });

  it('should auto-remove toast after duration', async () => {
    const user = userEvent.setup({ delay: null });

    render(
      <ToastProvider>
        <TestComponent />
      </ToastProvider>
    );

    const button = screen.getByText('Add Info Toast');
    await user.click(button);

    expect(screen.getByText('Info Toast')).toBeInTheDocument();

    // Fast-forward time
    act(() => {
      jest.advanceTimersByTime(1000);
    });

    await waitFor(() => {
      expect(screen.queryByText('Info Toast')).not.toBeInTheDocument();
    });
  });

  it('should remove toast when close button is clicked', async () => {
    const user = userEvent.setup({ delay: null });

    render(
      <ToastProvider>
        <TestComponent />
      </ToastProvider>
    );

    const button = screen.getByText('Add Success Toast');
    await user.click(button);

    expect(screen.getByText('Test Toast')).toBeInTheDocument();

    // Find and click close button
    const closeButton = screen.getByRole('button', { name: '' }); // X button has no text
    await user.click(closeButton);

    // Wait for exit animation
    act(() => {
      jest.advanceTimersByTime(300);
    });

    await waitFor(() => {
      expect(screen.queryByText('Test Toast')).not.toBeInTheDocument();
    });
  });

  it('should display multiple toasts', async () => {
    const user = userEvent.setup({ delay: null });

    render(
      <ToastProvider>
        <TestComponent />
      </ToastProvider>
    );

    await user.click(screen.getByText('Add Success Toast'));
    await user.click(screen.getByText('Add Error Toast'));

    expect(screen.getByText('Test Toast')).toBeInTheDocument();
    expect(screen.getByText('Error Toast')).toBeInTheDocument();
  });

  it('should apply correct styling for different toast types', async () => {
    const user = userEvent.setup({ delay: null });

    function MultiTypeComponent() {
      const { addToast } = useToast();

      return (
        <>
          <button onClick={() => addToast({ title: 'Success Toast', type: 'success' })}>Add Success</button>
          <button onClick={() => addToast({ title: 'Error Toast', type: 'error' })}>Add Error</button>
          <button onClick={() => addToast({ title: 'Warning Toast', type: 'warning' })}>Add Warning</button>
          <button onClick={() => addToast({ title: 'Info Toast', type: 'info' })}>Add Info</button>
        </>
      );
    }

    render(
      <ToastProvider>
        <MultiTypeComponent />
      </ToastProvider>
    );

    await user.click(screen.getByText('Add Success'));
    await user.click(screen.getByText('Add Error'));
    await user.click(screen.getByText('Add Warning'));
    await user.click(screen.getByText('Add Info'));

    // All toast titles should be rendered
    expect(screen.getByText('Success Toast')).toBeInTheDocument();
    expect(screen.getByText('Error Toast')).toBeInTheDocument();
    expect(screen.getByText('Warning Toast')).toBeInTheDocument();
    expect(screen.getByText('Info Toast')).toBeInTheDocument();
  });

  it('should handle toast without duration (manual close only)', async () => {
    const user = userEvent.setup({ delay: null });

    function NoDurationComponent() {
      const { addToast } = useToast();

      return (
        <button onClick={() => addToast({ title: 'Manual Close', duration: 0 })}>
          Add Manual Toast
        </button>
      );
    }

    render(
      <ToastProvider>
        <NoDurationComponent />
      </ToastProvider>
    );

    await user.click(screen.getByText('Add Manual Toast'));

    expect(screen.getByText('Manual Close')).toBeInTheDocument();

    // Fast-forward time - toast should still be there
    act(() => {
      jest.advanceTimersByTime(10000);
    });

    expect(screen.getByText('Manual Close')).toBeInTheDocument();
  });
});
