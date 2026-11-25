import torch
import torch.nn as nn


class ChurnMLP(nn.Module):
    """
    PyTorch Multi-Layer Perceptron for binary customer churn classification.
    Architecture: Linear -> BatchNorm1d -> ReLU -> Dropout -> Linear -> BatchNorm1d -> ReLU -> Dropout -> Logit
    Trained with BCEWithLogitsLoss.
    """

    def __init__(self, input_dim: int, hidden_dims: tuple[int, ...] = (128, 64, 32), dropout: float = 0.3):
        super().__init__()
        layers = []
        in_features = input_dim
        for hidden_dim in hidden_dims:
            layers.append(nn.Linear(in_features, hidden_dim))
            layers.append(nn.BatchNorm1d(hidden_dim))
            layers.append(nn.ReLU())
            layers.append(nn.Dropout(dropout))
            in_features = hidden_dim
        layers.append(nn.Linear(in_features, 1))
        self.network = nn.Sequential(*layers)

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        return self.network(x).squeeze(-1)
