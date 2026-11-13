import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import PropertyGallerySlider from './PropertyGallerySlider';

vi.mock('@/components/properties/ImageSequenceDialog', () => ({ ImageSequenceDialog: ({ current }: { current: string | null }) => current ? <img alt="enlarged" src={current} /> : null }));
beforeEach(() => { HTMLElement.prototype.scrollTo = vi.fn(); });
describe('shared property image navigation', () => {
  it('advances and wraps without opening the parent property', () => {
    const open = vi.fn();
    render(<div onClick={open}><PropertyGallerySlider compact photos={['one.jpg','two.jpg']} alt="property" /></div>);
    fireEvent.click(screen.getByRole('button', { name: 'תמונה הבאה' }));
    expect(screen.getByText('2/2')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'תמונה הבאה' }));
    expect(screen.getByText('1/2')).toBeInTheDocument();
    expect(open).not.toHaveBeenCalled();
  });
  it('selects thumbnails and enlarges the selected photo', () => {
    render(<PropertyGallerySlider photos={['one.jpg','two.jpg']} alt="property" />);
    fireEvent.click(screen.getByRole('button', { name: 'תמונה 2' }));
    expect(screen.getByRole('button', { name: 'תמונה 2' })).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(screen.getByRole('button', { name: 'הגדלת תמונה 2' }));
    expect(screen.getByAltText('enlarged')).toHaveAttribute('src', 'two.jpg');
  });
  it('keeps favorite and sharing actions available without photos', () => {
    const favorite = vi.fn(), share = vi.fn();
    render(<PropertyGallerySlider photos={[]} alt="property" onFavorite={favorite} share={<button onClick={share}>share</button>} />);
    fireEvent.click(screen.getByRole('button', { name: 'שמירה במועדפים' }));
    fireEvent.click(screen.getByRole('button', { name: 'share' }));
    expect(favorite).toHaveBeenCalledOnce();
    expect(share).toHaveBeenCalledOnce();
  });
});