import icon from './assets/comd-icon.svg';

export default function BrandMark({ className = '' }: { className?: string }) {
  return <img src={icon} className={`brand-mark ${className}`} alt="" aria-hidden="true" draggable={false}/>;
}
