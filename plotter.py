import matplotlib.pyplot as plt

LANG="en_US.UTF-8"
LANGUAGE="en_US.UTF-8"
LC_ALL="en_US.UTF-8"

latency = {}
byte = {}
time = 0

def process_line(line):
    x = line[:-2].split("(")[-1].split(",")
    lat, by = float(x[0]), float(x[1]) / 10**6
    return lat, by


with open("logs.txt", encoding='utf-8') as file:
    for line in file.readlines():
        l, b = process_line(line)
        latency[time] = l
        byte[time] = b
        time += 2


x = list(latency.keys())
y_lat = list(latency.values())
y_byte = list(byte.values())

fig = plt.figure(figsize=[10, 6])
ax = plt.subplot(111)
ax.set_xlabel('Time (min)')

ax_background = ax.twinx()

byte = ax_background.plot(x, y_byte, linestyle='dashed', label='MB Sent (right)', color='black', zorder=0, alpha=.55)
l = ax.fill_between(
    x,
    y_lat,
    linestyle='solid',
    label='Latency (ms)',
    zorder=10,
)

l.set_facecolors([[.5, .8, .5, .35]])
l.set_edgecolors([[0, .5, 0, .55]])
l.set_linewidths([1.5])
ax_background.set_yticks(range(0, 90, 6))
ax.set_xticks(range(0, 84, 4))
ax_background.grid(False)

# remove tick marks
ax.xaxis.set_tick_params(size=0)
ax.yaxis.set_tick_params(size=0)
ax_background.yaxis.set_tick_params(size=0)
ax.set_xlim(0, 80.5)

# tweak the axis labels
xlab = ax.xaxis.get_label()
ylab = ax.yaxis.get_label()
xlab.set_style('italic')
xlab.set_size(14)
ylab.set_style('italic')
ylab.set_size(14)

ybackgroundlab = ax_background.yaxis.get_label()
ybackgroundlab.set_style('italic')
ybackgroundlab.set_size(14)

ttl = ax.title
ttl.set_weight('bold')

ax.legend(loc='upper center', ncol=1, frameon=False)
ax_background.legend(loc='upper right', ncol=1, frameon=False)

# ax.set_yticks(range(step,up+step,step))
ax.set_ylim(-0.001)

plt.tight_layout()
plt.show()
plt.draw()
