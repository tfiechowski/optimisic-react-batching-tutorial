export function UpdatingButton() {
  return (
    <button className="btn btn-lg btn-outline-secondary" disabled>
      Updating ...
    </button>
  );
}

export function UnlikeButton({ onUnlike }) {
  return (
    <button className="btn btn-lg btn-outline-danger" onClick={onUnlike}>
      Unlike
    </button>
  );
}

export function LikeButton({ onLike }) {
  return (
    <button className="btn btn-lg btn-outline-success" onClick={onLike}>
      Like
    </button>
  );
}
