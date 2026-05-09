namespace SampleProject;

public sealed class Broken
{
    public int Fail() => MissingSymbol.Value;
}
