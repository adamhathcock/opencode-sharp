namespace SampleProject;

public abstract class Operation
{
    public abstract int Execute(int value);
}

public sealed class IncrementOperation : Operation
{
    public override int Execute(int value) => value + 1;
}
